"""vLLM AsyncLLMEngine wrapper.

Host (2026-07): Threadripper rig with an RTX 3090 (24 GB VRAM). The 24 GB
lets us run Gemma-3-27B (Google's, exceptionally strong at German) as a 4-bit
AWQ quant — ~15 GB weights, leaving comfortable KV-cache headroom.
max_model_len is capped well below the checkpoint's 128k context so the KV
cache stays small and turn latency low.

(History: the project began on an RTX 4080 *Laptop* GPU with only 12 GB, where
just Mistral-7B AWQ fit. The model is pure configuration — see below.)
"""

import asyncio
import os
import uuid

# This host has only the NVIDIA driver, no CUDA toolkit — flashinfer's
# sampler JIT-compiles with nvcc and crashes the engine without it. The
# torch-native sampler needs no compilation. Must be set before the vLLM
# EngineCore process spawns (it inherits our environment).
os.environ.setdefault("VLLM_USE_FLASHINFER_SAMPLER", "0")

# Overridable per-host without code changes, e.g. to try a different model:
#   LOTTA_MODEL="Qwen/Qwen2.5-32B-Instruct-AWQ" LOTTA_MAX_LEN=8192 ./restart.sh
#
# Gemma-3-27B is a *multimodal* checkpoint: vLLM also loads its vision tower,
# and the model has a 256k-token vocab (large embedding + logits buffers).
# That fixed overhead leaves less room for the KV cache than a plain text
# model of the same weight size, so we run a high memory fraction and a
# modest context cap (4096 is ample for a spoken back-and-forth with the
# capped history in prompts.py). Symptom if these are too aggressive:
# "available KV cache memory" ValueError at engine init — lower MAX_LEN.
MODEL = os.environ.get("LOTTA_MODEL", "gaunernst/gemma-3-27b-it-int4-awq")
MAX_MODEL_LEN = int(os.environ.get("LOTTA_MAX_LEN", "4096"))
GPU_UTIL = float(os.environ.get("LOTTA_GPU_UTIL", "0.94"))

# Guided decoding (xgrammar) constrains generation to this schema — the
# model *cannot* emit prose, markdown fences, or malformed JSON. The parse
# fallback chain in parsing.py remains as belt-and-braces (e.g. truncation
# at max_tokens can still cut a string short).
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "severity": {"type": "string", "enum": ["severe", "minor", "none"]},
        "corrected": {"type": ["string", "null"]},
        "errors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wrong": {"type": "string"},
                    "right": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["wrong", "right", "note"],
            },
        },
        "spoken_correction": {"type": ["string", "null"]},
        "reply": {"type": "string"},
    },
    "required": ["severity", "corrected", "errors", "spoken_correction", "reply"],
}

_engine = None
_tokenizer = None
_load_error: str | None = None


def is_loaded() -> bool:
    return _engine is not None


def load_error() -> str | None:
    return _load_error


def _build_engine():
    from transformers import AutoTokenizer
    from vllm import AsyncEngineArgs
    from vllm.engine.async_llm_engine import AsyncLLMEngine

    args = AsyncEngineArgs(
        model=MODEL,
        gpu_memory_utilization=GPU_UTIL,
        max_model_len=MAX_MODEL_LEN,
        # Gemma-3's vision tower is already loaded; allow one image per turn so
        # the /session/vision path can attach a photo. Bounding this to 1 also
        # caps vLLM's startup memory-profiling run (which sizes for a dummy
        # max-image) to a single image — important on the 24 GB card.
        limit_mm_per_prompt={"image": 1},
    )
    # The tokenizer's chat template formats prompts correctly for whatever
    # model is configured ([INST] for Mistral, ChatML for Qwen, ...)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    return AsyncLLMEngine.from_engine_args(args), tokenizer


async def init_engine() -> None:
    """Load the model and run a warmup generation (first generation after
    load is slow due to CUDA graph capture; the warmup keeps real turns
    inside the latency budget)."""
    global _engine, _tokenizer, _load_error
    try:
        _engine, _tokenizer = await asyncio.get_running_loop().run_in_executor(
            None, _build_engine
        )
        await generate("Sag hallo.", max_tokens=8, structured=False)
        print("[llm] engine loaded and warmed up", flush=True)
    except Exception as e:  # surfaced via /health, server stays up
        _load_error = f"{type(e).__name__}: {e}"
        print(f"[llm] engine load failed: {_load_error}", flush=True)


async def generate(
    content: str, max_tokens: int = 500, structured: bool = True, image=None
) -> str:
    from vllm import SamplingParams
    from vllm.sampling_params import StructuredOutputsParams

    if _engine is None:
        raise RuntimeError("engine not loaded")

    if image is not None:
        # Multimodal turn. Build the Gemma-3 chat prompt manually (matching
        # vLLM's own Gemma-3 example) with a single <start_of_image> sentinel:
        # vLLM's registered Gemma3 processor expands that one token into
        # boi + 256 soft image tokens + eoi from the PIL image below. We do NOT
        # go through the tokenizer's chat template here — the AWQ repo's
        # template is not guaranteed to render an image placeholder, and manual
        # construction is decoupled from it.
        prompt_text = (
            "<bos><start_of_turn>user\n"
            f"<start_of_image>{content}<end_of_turn>\n"
            "<start_of_turn>model\n"
        )
        prompt = {"prompt": prompt_text, "multi_modal_data": {"image": image}}
    else:
        # Text path — unchanged. The tokenizer's chat template formats prompts
        # correctly for whatever model is configured.
        prompt = _tokenizer.apply_chat_template(
            [{"role": "user", "content": content}],
            tokenize=False,
            add_generation_prompt=True,
        )

    params = SamplingParams(
        max_tokens=max_tokens,
        temperature=0.4,
        structured_outputs=StructuredOutputsParams(json=RESPONSE_SCHEMA) if structured else None,
    )
    final = None
    async for output in _engine.generate(prompt, params, request_id=str(uuid.uuid4())):
        final = output
    return final.outputs[0].text if final and final.outputs else ""
