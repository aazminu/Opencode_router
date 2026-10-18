import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { FailoverScene } from "./scenes/FailoverScene";
import { InstallScene } from "./scenes/InstallScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ScorecardScene } from "./scenes/ScorecardScene";
import { TitleScene } from "./scenes/TitleScene";

export const RouterDemo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Problem" durationInFrames={135}>
        <ProblemScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Title" durationInFrames={90}>
        <TitleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Scorecard" durationInFrames={210}>
        <ScorecardScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Failover" durationInFrames={240}>
        <FailoverScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Install" durationInFrames={150}>
        <InstallScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
