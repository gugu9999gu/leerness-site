import { Composition } from 'remotion';
import { ReleaseShort } from './ReleaseShort';

// 9:16 숏폼 (1080x1920), 30fps. 길이는 하이라이트 수에 따라 동적(아래 calculateMetadata).
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ReleaseShort"
        component={ReleaseShort}
        durationInFrames={FPS * 14}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          version: '1.9.413',
          date: '2026-06-07',
          title: 'action 명령 --json 구조화 출력',
          summary: 'task/decision/rule/lesson add 가 --json 을 무시하던 것을 구조화 JSON 출력으로.',
          highlights: [
            'task add → {ok,id,status,request}',
            '코어 데이터 영속 후 JSON 1줄 출력',
            'selftest 159 · e2e 352 회귀 0',
          ],
          categoryKo: '일관성',
          categoryEn: 'Consistency',
          lang: 'ko' as const,
        }}
        calculateMetadata={({ props }) => {
          const n = Math.max(1, (props.highlights || []).length);
          // 인트로 2.5s + 하이라이트 n*2.2s + 아웃트로 3s
          const seconds = 2.5 + n * 2.2 + 3;
          return { durationInFrames: Math.round(FPS * seconds) };
        }}
      />
    </>
  );
};
