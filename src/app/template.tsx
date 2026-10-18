// A template re-mounts on every navigation, so each page slides in once.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
