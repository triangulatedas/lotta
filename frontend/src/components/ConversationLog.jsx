import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble.jsx";

export default function ConversationLog({ messages, onRetry }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Retry is only offered on the most recent user message — undoing an
  // older turn would leave the conversation history inconsistent.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  return (
    <main className="log">
      {messages.map((m, i) => (
        <MessageBubble
          key={i}
          message={m}
          onRetry={onRetry && i === lastUserIndex ? () => onRetry(i) : null}
        />
      ))}
      <div ref={endRef} />
    </main>
  );
}
