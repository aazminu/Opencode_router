import { Composition, Folder, Still } from "remotion";
import { RouterDemo } from "./RouterDemo";
import { SocialPreview } from "./SocialPreview";
import { FailoverScene } from "./scenes/FailoverScene";
import { InstallScene } from "./scenes/InstallScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ScorecardScene } from "./scenes/ScorecardScene";
import { TitleScene } from "./scenes/TitleScene";

// The main video is the sum of the scene lengths (825 frames) minus four 15-frame fades.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="RouterDemo-Scenes">
        <Composition
          id="Problem"
          component={ProblemScene}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={135}
        />
        <Composition id="Title" component={TitleScene} width={1920} height={1080} fps={30} durationInFrames={90} />
        <Composition
          id="Scorecard"
          component={ScorecardScene}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={210}
        />
        <Composition
          id="Failover"
          component={FailoverScene}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={240}
        />
        <Composition
          id="Install"
          component={InstallScene}
          width={1920}
          height={1080}
          fps={30}
          durationInFrames={150}
        />
      </Folder>
      <Composition
        id="RouterDemo"
        component={RouterDemo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={765}
      />
      <Still id="SocialPreview" component={SocialPreview} width={1280} height={640} />
    </>
  );
};
