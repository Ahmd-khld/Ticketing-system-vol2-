import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo 2.png';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [auth, setAuth] = React.useState({
    token: localStorage.getItem('token'),
    role: localStorage.getItem('role'),
  });

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setAuth({
      token: localStorage.getItem('token'),
      role: localStorage.getItem('role'),
    });
    setIsMenuOpen(false);
  }, [location]);

  const { token, role } = auth || { token: null, role: null };
  const isAuthenticated = token && token !== 'null' && token !== 'undefined';

  const isActive = (path, isMobile = false) => {
    const isCurrent = location?.pathname === path;
    const base = isMobile
      ? 'block py-4 px-6 transition-all uppercase text-[14px] tracking-widest font-black border-l-4'
      : 'pb-1 transition-all uppercase text-[13px] tracking-widest font-black whitespace-nowrap shrink-0 border-b-2';

    if (isCurrent) {
      return isMobile
        ? `${base} border-white bg-white/10 text-white`
        : `${base} border-white text-white`;
    }
    return isMobile
      ? `${base} border-transparent text-white/60 hover:text-white hover:bg-white/5`
      : `${base} border-transparent text-white/70 hover:text-white hover:border-white/30`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('adminEmail');
    localStorage.removeItem('userId');
    setAuth({ token: null, role: null });
    setIsMenuOpen(false);
    navigate('/');
  };

  return (
    <nav className="bg-[#0B4228] text-white shadow-2xl sticky top-0 z-50 transition-colors duration-300 border-b-2 border-[#09361a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 md:h-24 flex justify-between items-center">
        <Link
          to="/"
          className="hover:opacity-90 transition transform shrink-0 z-20 -my-4 md:-my-8"
        >
          <img
            src={logo}
            alt="Smart Garden Logo"
            className="h-20 md:h-28 w-auto object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.4)]"
          />
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-6 lg:gap-8 text-[15px] font-bold justify-end py-2 ml-4">
          {!isAuthenticated && (
            <Link to="/" className={isActive('/')}>
              Home
            </Link>
          )}
          {!(role === 'admin' || role === 'sub-admin') && (
            <>
              {!isAuthenticated && (
                <Link to="/about" className={isActive('/about')}>
                  About Us
                </Link>
              )}
              <Link to="/map" className={isActive('/map')}>
                Park Map
              </Link>
            </>
          )}
          {isAuthenticated && (
            <>
              <Link to="/book" className={isActive('/book')}>
                Book Tickets
              </Link>
              {!(role === 'admin' || role === 'sub-admin') && (
                <Link to="/rewards" className={isActive('/rewards')}>
                  Play & Win
                </Link>
              )}
            </>
          )}

          {isAuthenticated && (
            <Link
              to="/profile"
              className={`flex items-center space-x-1 shrink-0 ${isActive('/profile')}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                ></path>
              </svg>
              <span>Profile</span>
            </Link>
          )}

          {isAuthenticated && !location.pathname.includes('/admin') && (
            <button
              onClick={handleLogout}
              className="text-white/70 hover:text-white transition-colors font-bold uppercase text-xs tracking-widest whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg border border-transparent hover:border-white/20"
            >
              Logout
            </button>
          )}

          {isAuthenticated && (role === 'admin' || role === 'sub-admin') && (
            <Link
              to="/admin/dashboard"
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black transition-all transform hover:-translate-y-0.5 whitespace-nowrap shrink-0 shadow-md"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                ></path>
              </svg>
              <span className="tracking-widest uppercase text-[12px]">Admin Panel</span>
            </Link>
          )}
        </div>

        {/* Mobile Actions (Hamburger only) */}
        <div className="flex md:hidden items-center space-x-4">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors focus:outline-none"
            aria-label="Toggle Menu"
          >
            {isMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out bg-[#0B4228] border-t border-white/10 ${
          isMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="py-2 flex flex-col">
          {!isAuthenticated && (
            <Link to="/" className={isActive('/', true)}>
              Home
            </Link>
          )}
          {!(role === 'admin' || role === 'sub-admin') && (
            <>
              {!isAuthenticated && (
                <Link to="/about" className={isActive('/about', true)}>
                  About Us
                </Link>
              )}
              <Link to="/map" className={isActive('/map', true)}>
                Park Map
              </Link>
            </>
          )}
          {isAuthenticated && (
            <>
              <Link to="/book" className={isActive('/book', true)}>
                Book Tickets
              </Link>
              {!(role === 'admin' || role === 'sub-admin') && (
                <Link to="/rewards" className={isActive('/rewards', true)}>
                  Play & Win
                </Link>
              )}
              <Link to="/profile" className={isActive('/profile', true)}>
                My Profile
              </Link>
            </>
          )}

          {isAuthenticated && (role === 'admin' || role === 'sub-admin') && (
            <Link
              to="/admin/dashboard"
              className="mx-4 my-4 flex items-center justify-center space-x-2 bg-white text-[#0B4228] py-4 rounded-2xl font-black uppercase tracking-widest text-xs"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Admin Panel</span>
            </Link>
          )}

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              className="w-full text-left py-4 px-6 text-red-300 font-black uppercase tracking-widest text-[14px] hover:bg-red-900/20 border-l-4 border-transparent"
            >
              Logout Account
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
