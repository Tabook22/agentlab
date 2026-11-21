import type {ReactNode} from 'react';
import {motion, useReducedMotion} from 'motion/react';
import './missionWorkspace.css';

// Keep the mission compass mounted while the work beneath it changes stages.
export function MissionWorkspace({stage, navigation, children}:{stage:string;navigation:ReactNode;children:ReactNode}) {
 const reducedMotion=useReducedMotion();
 return <div className={`mission-workspace workspace-${stage}`}>
  {navigation}
  <motion.div key={stage} className="mission-workspace-content" initial={reducedMotion?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reducedMotion?0:.28,ease:'easeOut'}}>
   {children}
  </motion.div>
 </div>;
}
