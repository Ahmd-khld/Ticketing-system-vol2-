import React from 'react';
import { Link } from 'react-router-dom';

const About = () => {
  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex flex-col font-sans transition-colors duration-300">
      <header className="bg-smart-dark dark:bg-black text-white py-12 md:py-20 shadow-xl relative overflow-hidden border-b border-smart-light/20">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-smart-glow opacity-5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl"></div>
        <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
          <h1 className="text-3xl md:text-6xl font-black tracking-tighter mb-4 md:mb-6 italic uppercase leading-tight">
            Our Graduation Project
          </h1>
          <p className="text-lg md:text-2xl font-medium text-smart-light max-w-3xl mx-auto leading-relaxed">
            Welcome to the future of public spaces. We are building an IoT-integrated Smart Park
            designed to be sustainable, inclusive, and fully automated.
          </p>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="text-center mb-12 md:mb-20">
          <h2 className="text-3xl md:text-4xl font-black text-smart-dark dark:text-smart-glow mb-4 tracking-tighter italic uppercase">
            Hardware Integrations
          </h2>
          <div className="w-16 md:w-24 h-1.5 md:h-2 bg-smart-light mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mb-16 md:mb-24">
          {/* Inclusive Accessibility */}
          <div className="bg-white dark:bg-gray-800 rounded-[30px] md:rounded-[40px] p-8 md:p-10 shadow-xl border-t-8 border-smart-light hover:shadow-2xl transition-all transform md:hover:-translate-y-2 dark:border-smart-light/50">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-smart-light/10 rounded-2xl md:rounded-3xl flex items-center justify-center mb-6 md:mb-8 shadow-inner">
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-smart-light"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl md:text-2xl font-black text-smart-dark dark:text-white mb-3 md:mb-4 italic uppercase">
              Inclusive Accessibility
            </h3>
            <p className="text-sm md:text-lg text-smart-gray dark:text-gray-300 leading-relaxed font-medium">
              Equipped with <strong className="text-smart-light">RFID tags</strong> that seamlessly
              trigger automated wheelchair ramps for easy entry. Strategically placed{' '}
              <strong className="text-smart-light">motion sensors</strong> also activate audio
              guidance speakers to help direct visually impaired visitors along the correct routes.
            </p>
          </div>

          {/* Automated Environment */}
          <div className="bg-white dark:bg-gray-800 rounded-[30px] md:rounded-[40px] p-8 md:p-10 shadow-xl border-t-8 border-smart-dark hover:shadow-2xl transition-all transform md:hover:-translate-y-2 dark:border-smart-glow/50">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-smart-dark/10 rounded-2xl md:rounded-3xl flex items-center justify-center mb-6 md:mb-8 shadow-inner">
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-smart-dark dark:text-smart-glow"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl md:text-2xl font-black text-smart-dark dark:text-white mb-3 md:mb-4 italic uppercase">
              Automated Environment
            </h3>
            <p className="text-sm md:text-lg text-smart-gray dark:text-gray-300 leading-relaxed font-medium">
              To maintain the park's lush greenery while conserving water, we utilize{' '}
              <strong className="text-smart-light">automated soil irrigation</strong>. Soil moisture
              sensors continuously monitor hydration levels and activate the sprinklers only when
              absolutely necessary.
            </p>
          </div>

          {/* Smart Waste Management */}
          <div className="bg-white dark:bg-gray-800 rounded-[30px] md:rounded-[40px] p-8 md:p-10 shadow-xl border-t-8 border-smart-dark hover:shadow-2xl transition-all transform md:hover:-translate-y-2 dark:border-smart-glow/50">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-emerald-400/10 rounded-2xl md:rounded-3xl flex items-center justify-center mb-6 md:mb-8 shadow-inner">
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl md:text-2xl font-black text-smart-dark dark:text-white mb-3 md:mb-4 italic uppercase">
              Smart Waste Management
            </h3>
            <p className="text-sm md:text-lg text-smart-gray dark:text-gray-300 leading-relaxed font-medium">
              Keeping the environment pristine is our priority.{' '}
              <strong className="text-smart-light">Smart trash bins</strong> automatically
              categorize waste types and send instant notifications to the janitorial staff when
              they reach full capacity, optimizing cleanup routes.
            </p>
          </div>

          {/* Pet Care */}
          <div className="bg-white dark:bg-gray-800 rounded-[30px] md:rounded-[40px] p-8 md:p-10 shadow-xl border-t-8 border-smart-light hover:shadow-2xl transition-all transform md:hover:-translate-y-2 dark:border-smart-light/50">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-smart-light/10 rounded-2xl md:rounded-3xl flex items-center justify-center mb-6 md:mb-8 shadow-inner">
              <svg
                className="w-8 h-8 md:w-10 md:h-10 text-smart-light"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </div>
            <h3 className="text-xl md:text-2xl font-black text-smart-dark dark:text-white mb-3 md:mb-4 italic uppercase">
              Pet Care
            </h3>
            <p className="text-sm md:text-lg text-smart-gray dark:text-gray-300 leading-relaxed font-medium">
              We haven't forgotten our furry friends! The park features strategically located{' '}
              <strong className="text-smart-light">automated pet food dispensers</strong> to ensure
              that pets are well-fed and hydrated during their visit.
            </p>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center bg-white dark:bg-gray-800 rounded-[40px] md:rounded-[50px] p-8 md:p-16 shadow-2xl border border-smart-light/20 dark:border-gray-700 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-5xl font-black text-smart-dark dark:text-white mb-6 md:mb-8 italic uppercase tracking-tighter leading-tight">
            Ready to Experience the Park?
          </h2>
          <p className="text-base md:text-xl text-smart-gray dark:text-gray-400 mb-8 md:mb-12 max-w-2xl mx-auto font-medium">
            Get exclusive access to all of our automated smart features today. Booking your ticket
            online takes less than a minute!
          </p>
          <Link
            to="/book"
            className="inline-block w-full sm:w-auto bg-smart-light hover:bg-smart-dark text-white font-black text-lg md:text-2xl py-4 md:py-6 px-10 md:px-16 rounded-full transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-2 active:scale-95 uppercase tracking-widest"
          >
            Book Your Tickets
          </Link>
        </div>
      </main>
    </div>

  );
};

export default About;
