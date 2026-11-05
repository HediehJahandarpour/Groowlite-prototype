type ReflectionAnswerInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
};

export function ReflectionAnswerInput({
  value,
  onChange,
  disabled = false,
  id = "reflection-answer",
}: ReflectionAnswerInputProps) {
  return (
    <textarea
      id={id}
      className="reflection-answer"
      value={value}
      disabled={disabled}
      rows={4}
      placeholder="Write your thoughts here..."
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
