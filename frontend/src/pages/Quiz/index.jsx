// Quiz sub-router. App delegates any /quiz* path here.
import { matchRoute } from '../../router';
import QuizHome from './QuizHome';
import QuizSetup from './QuizSetup';
import QuizPlay from './QuizPlay';
import QuizResult from './QuizResult';
import QuizReview from './QuizReview';

export default function QuizRouter({ pathname }) {
  let m;
  if (matchRoute('/quiz/setup', pathname)) return <QuizSetup />;
  if ((m = matchRoute('/quiz/play/:roundId', pathname))) return <QuizPlay roundId={m.roundId} />;
  if ((m = matchRoute('/quiz/result/:roundId', pathname))) return <QuizResult roundId={m.roundId} />;
  if ((m = matchRoute('/quiz/review/:roundId', pathname))) return <QuizReview roundId={m.roundId} />;
  return <QuizHome />;
}
