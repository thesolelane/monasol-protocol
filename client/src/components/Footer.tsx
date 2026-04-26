import logo from "@assets/A_logo_design_for_Cooperanth_Consulting_LLC_is_dis_17573022323_1777170265567.png";

export function Footer() {
  return (
    <div className="w-full py-8 mt-16 border-t border-white/10 bg-black/40 text-center relative z-10">
      <div className="flex flex-col items-center justify-center gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-sm flex items-center justify-center overflow-hidden">
            <img src={logo} alt="Cooperanth Consulting LLC Logo" className="w-full h-full object-cover" />
          </div>
          <span className="font-medium text-gray-400">MonasolProtocol — Owned by Cooperanth Consulting LLC</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a href="mailto:acooper@cooperanth.com" className="hover:text-white transition-colors">acooper@cooperanth.com</a>
          <span className="hidden sm:inline text-white/20">|</span>
          <a href="tel:9783201714" className="hover:text-white transition-colors">978-320-1714</a>
        </div>
      </div>
    </div>
  );
}
