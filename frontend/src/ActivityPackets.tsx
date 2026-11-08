// Repeating packets indicate ongoing activity, rather than additional deliveries.
export function ActivityPackets({path,reversePath}:{path:string;reversePath?:string}) {
  return <g className="activity-packets" aria-hidden="true">{[path,reversePath].filter(Boolean).map((route,i)=><g key={i}>
    <circle r="17" fill={i?'#259e9a':'#8456dc'} opacity=".13"/><rect x="-13" y="-9" width="26" height="18" rx="4" fill={i?'#259e9a':'#8456dc'} stroke="white" strokeWidth="2"/>
    <path d="M-5 -2 L0 1 L5 -2 M-5 3 H5" fill="none" stroke="white" strokeWidth="1.3"/>
    <animateMotion path={route} begin={i?'-1.3s':'-0.7s'} dur={i?'3.3s':'2.8s'} repeatCount="indefinite"/>
  </g>)}</g>;
}

