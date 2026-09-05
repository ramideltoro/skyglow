import { ArrowUpRight } from "lucide-react";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>SKYGLOW · RECEIVED HERE</span>
      <div className="site-footer-links">
        <a href="https://wiki.skyglow.ramideltoro.com" target="_blank" rel="noreferrer">
          Skyglow wiki <ArrowUpRight size={13} />
        </a>
        <a href="https://antenna.ramideltoro.com" target="_blank" rel="noreferrer">
          Antenna Observatory <ArrowUpRight size={13} />
        </a>
        <a href="https://wiki.antenna.ramideltoro.com" target="_blank" rel="noreferrer">
          Antenna wiki <ArrowUpRight size={13} />
        </a>
      </div>
    </footer>
  );
}
