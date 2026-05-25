// Quiz sub-router. App delegates any /quiz* path here so the top-level shell
// stays stable while the quiz flow grows (T11 / J7).
import QuizHome from './QuizHome';

export default function QuizRouter() {
  return <QuizHome />;
}
