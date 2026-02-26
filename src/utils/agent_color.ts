const AGENT_COLORS = [
  { border: "border-l-violet-500", badge: "bg-violet-500/20 text-violet-300", dot: "bg-violet-500", label: "text-violet-300", stroke: "rgb(139 92 246)" },
  { border: "border-l-cyan-500", badge: "bg-cyan-500/20 text-cyan-300", dot: "bg-cyan-500", label: "text-cyan-300", stroke: "rgb(6 182 212)" },
  { border: "border-l-amber-500", badge: "bg-amber-500/20 text-amber-300", dot: "bg-amber-500", label: "text-amber-300", stroke: "rgb(245 158 11)" },
  { border: "border-l-emerald-500", badge: "bg-emerald-500/20 text-emerald-300", dot: "bg-emerald-500", label: "text-emerald-300", stroke: "rgb(16 185 129)" },
  { border: "border-l-rose-500", badge: "bg-rose-500/20 text-rose-300", dot: "bg-rose-500", label: "text-rose-300", stroke: "rgb(244 63 94)" },
  { border: "border-l-indigo-500", badge: "bg-indigo-500/20 text-indigo-300", dot: "bg-indigo-500", label: "text-indigo-300", stroke: "rgb(99 102 241)" },
  { border: "border-l-teal-500", badge: "bg-teal-500/20 text-teal-300", dot: "bg-teal-500", label: "text-teal-300", stroke: "rgb(20 184 166)" },
  { border: "border-l-orange-500", badge: "bg-orange-500/20 text-orange-300", dot: "bg-orange-500", label: "text-orange-300", stroke: "rgb(249 115 22)" },
];

function hash_string(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return Math.abs(h);
}

export function get_agent_color(agent_name: string): typeof AGENT_COLORS[0] {
  const index = hash_string(agent_name) % AGENT_COLORS.length;
  return AGENT_COLORS[index];
}
