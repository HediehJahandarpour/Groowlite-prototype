type ReflectionQuestionProps = {
  question: string;
  step: 1 | 2;
};

export function ReflectionQuestion({ question, step }: ReflectionQuestionProps) {
  return (
    <div className="reflection-question">
      <p className="reflection-question__step">Question {step} of 2</p>
      <p className="reflection-question__text">{question}</p>
    </div>
  );
}
