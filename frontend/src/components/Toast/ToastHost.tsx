import React, { useEffect } from "react";
import styles from "./ToastHost.module.css";

export interface ToastMessage {
  id: string;
  intent: "error" | "info" | "success" | "warning";
  title: string;
  description?: string;
  autoDismissMs?: number;
}

interface Props {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

const intentIcon: Record<string, string> = {
  error: "⚠",
  info: "ℹ",
  success: "✓",
  warning: "!"
};

export const ToastHost: React.FC<Props> = ({ messages, onDismiss }) => {
  useEffect(() => {
    const timers = messages.map(m => {
      const ttl = m.autoDismissMs ?? (m.intent === "error" ? 6000 : 4000);
      return setTimeout(() => onDismiss(m.id), ttl);
    });
    return () => timers.forEach(t => clearTimeout(t));
  }, [messages, onDismiss]);

  return (
    <div className={styles.toastViewport} role="region" aria-label="Notifications">
      <div className={styles.toastStack}>
        {messages.map(m => (
          <div
            key={m.id}
            className={`${styles.toast} ${styles[m.intent]}`}
            role={m.intent === "error" ? "alert" : "status"}
          >
            <div className={styles.icon}>{intentIcon[m.intent]}</div>
            <div className={styles.content}>
              <div className={styles.title}>{m.title}</div>
              {m.description && <div className={styles.description}>{m.description}</div>}
            </div>
            <button
              className={styles.closeBtn}
              aria-label="Dismiss notification"
              onClick={() => onDismiss(m.id)}
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
};
