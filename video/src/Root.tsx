import { Composition } from 'remotion';
import { ReleaseShort } from './ReleaseShort';
import { TOTAL_SECONDS } from './copy';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ReleaseShort"
        component={ReleaseShort}
        durationInFrames={Math.round(FPS * TOTAL_SECONDS)}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          version: '1.9.412',
          date: '2026-06-07',
          title: 'list-family positional path 지원',
          summary: '일관성 footgun 수정',
          highlights: [],
          categoryKo: '신기능',
          categoryEn: 'Feature',
          lang: 'ko' as const,
        }}
      />
    </>
  );
};
