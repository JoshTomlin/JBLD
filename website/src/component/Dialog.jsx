import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function Dialog({ title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="app_dialog"
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onClick={(event) => {
        if (event.target !== ref.current) return;
        const bounds = ref.current.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeRef.current();
      }}
    >
      <div className="dialog_heading">
        <h2>{title}</h2>
        <button type="button" className="dialog_close" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>, document.body
  );
}
