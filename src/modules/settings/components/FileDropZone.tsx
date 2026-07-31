import { DragEvent, useRef, useState } from "react";

type Props = {
  accept?: string;
  hint: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onFile: (file: File) => void;
  className?: string;
};

export function FileDropZone({
  accept,
  hint,
  icon,
  disabled,
  onFile,
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || disabled) return;
    onFile(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div
      className={`stg-dropzone${dragOver ? " stg-dropzone--over" : ""}${disabled ? " stg-dropzone--disabled" : ""} ${className}`.trim()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="stg-dropzone__input"
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {icon ? <span className="stg-dropzone__icon" aria-hidden>{icon}</span> : null}
      <p className="stg-dropzone__hint">{hint}</p>
      <span className="stg-dropzone__action">Seleccionar archivo</span>
    </div>
  );
}
