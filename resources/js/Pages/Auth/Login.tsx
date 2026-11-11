import React, { useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import { SparcLogo } from '@/Components/SparcLogo';
import { ThemeToggle } from '@/Components/UI/ThemeToggle';
import {
    Mail,
    Lock,
    Eye,
    EyeOff,
    Sparkles,
    CheckCircle2,
} from 'lucide-react';

interface LoginProps {
    status?: string;
    canResetPassword?: boolean;
}

export default function Login({ status }: LoginProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: true,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/login', {
            onFinish: () => reset('password'),
        });
    };

    const handleFillDemo = (email = 'test@example.com', password = 'password') => {
        setData({
            email,
            password,
            remember: true,
        });
        setIsDemoSubmitting(true);
        router.post(
            '/login',
            {
                email,
                password,
                remember: true,
            },
            {
                onFinish: () => setIsDemoSubmitting(false),
            }
        );
    };

    return (
        <div className="min-h-screen w-full bg-[#E5E7EB] dark:bg-[#070B12] flex items-center justify-center p-3 sm:p-6 lg:p-10 font-sans transition-colors duration-200">
            <Head title="Masuk — SPARC Workspace" />

            {/* Main Outer Canvas Container (Exact Replica of Design Mockup) */}
            <div className="w-full max-w-[1120px] rounded-[32px] sm:rounded-[40px] lg:rounded-[48px] bg-white dark:bg-[#0B1320] border border-slate-200/80 dark:border-slate-800/80 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.08)] dark:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.65)] p-6 sm:p-10 lg:p-14 relative overflow-hidden flex flex-col justify-between min-h-[640px] lg:min-h-[740px]">
                
                {/* 1. TOP HEADER: Logo Left + Round Utility Buttons Right */}
                <header className="w-full flex items-center justify-between z-20">
                    <div className="flex items-center gap-3">
                        <SparcLogo size="sm" />
                    </div>

                    <div className="flex items-center gap-2.5">
                        {/* Theme Toggle Button */}
                        <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 bg-[#FAFBFD] dark:bg-[#121B2B] flex items-center justify-center shadow-xs">
                            <ThemeToggle size="sm" />
                        </div>

                        {/* Instagram Link Button */}
                        <a
                            href="https://www.instagram.com/lazalazhar/"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Instagram SPARC"
                            className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121B2B] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors shadow-xs"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                            </svg>
                        </a>

                        {/* WhatsApp Direct Link Button */}
                        <a
                            href="https://wa.me/6285841980107"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Hubungi WhatsApp Bantuan"
                            className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 flex items-center justify-center transition-opacity shadow-xs"
                        >
                            <svg className="w-4 h-4 fill-current rotate-45 -translate-y-0.5" viewBox="0 0 24 24">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        </a>
                    </div>
                </header>

                {/* 2. CENTER CONTENT WITH LEFT CALENDAR & RIGHT CREATOR ASSETS */}
                <div className="relative flex-1 flex items-center justify-center py-6 sm:py-8 lg:py-10 z-10">
                    {/* LEFT ASSET: Team Brainstorming moved to far left corner */}
                    <div className="hidden md:block absolute -left-2 sm:-left-4 lg:-left-6 xl:-left-8 bottom-0 z-10 pointer-events-none select-none">
                        {/* Light mode team asset */}
                        <img
                            src="/images/aset-team.png"
                            alt="Ilustrasi Tim Brainstorming SPARC"
                            className="w-40 sm:w-48 lg:w-52 xl:w-56 h-auto object-contain dark:hidden"
                        />
                        {/* Dark mode team asset */}
                        <img
                            src="/images/aset-team-dark.png"
                            alt="Ilustrasi Tim Brainstorming SPARC Dark"
                            className="w-40 sm:w-48 lg:w-52 xl:w-56 h-auto object-contain hidden dark:block"
                        />
                    </div>

                    {/* CENTRAL FLOATING CARD (Matches exact dimensions, radius, and inputs) */}
                    <div className="w-full max-w-[390px] sm:max-w-[420px] bg-white dark:bg-[#111A29] rounded-[28px] sm:rounded-[36px] border border-slate-200/90 dark:border-slate-800 shadow-[0_15px_45px_-10px_rgba(15,23,42,0.07)] dark:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] p-7 sm:p-9 relative z-20">
                        
                        {/* Heading & Subtitle */}
                        <div className="space-y-1.5 mb-6 text-left">
                            <h1 className="text-2xl sm:text-[28px] font-black text-slate-900 dark:text-white leading-[1.15] tracking-tight">
                                Lets<br />
                                Start Planning
                            </h1>
                            <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 font-medium">
                                Silakan masuk untuk mengakses workspace HUMAS
                            </p>
                        </div>

                        {/* Flash Status Notice if session flash present */}
                        {status && (
                            <div className="mb-4 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                                <span>{status}</span>
                            </div>
                        )}

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-3.5">
                            {/* Email Input */}
                            <div className="space-y-1">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                                        <Mail className="w-4 h-4" />
                                    </div>
                                    <input
                                        id="email"
                                        type="text"
                                        name="email"
                                        value={data.email}
                                        autoComplete="username"
                                        autoFocus
                                        placeholder="Email atau Username (Contoh: test atau admin@sparc.go.id)"
                                        onChange={(e) => setData('email', e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 sm:py-3.5 rounded-2xl text-xs sm:text-sm bg-slate-100/70 dark:bg-[#182335] border border-transparent focus:border-slate-300 dark:focus:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1546D8] transition-all"
                                        required
                                    />
                                </div>
                                {errors.email && (
                                    <p className="text-[11px] font-medium text-rose-500 pl-1">
                                        {errors.email}
                                    </p>
                                )}
                            </div>

                            {/* Password Input */}
                            <div className="space-y-1">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={data.password}
                                        autoComplete="current-password"
                                        placeholder="Your Password"
                                        onChange={(e) => setData('password', e.target.value)}
                                        className="w-full pl-11 pr-11 py-3 sm:py-3.5 rounded-2xl text-xs sm:text-sm bg-slate-100/70 dark:bg-[#182335] border border-transparent focus:border-slate-300 dark:focus:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1546D8] transition-all"
                                        required
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p className="text-[11px] font-medium text-rose-500 pl-1">
                                        {errors.password}
                                    </p>
                                )}
                            </div>

                            {/* Main Sign In Button (SPARC Royal Blue #1546D8) */}
                            <button
                                type="submit"
                                disabled={processing || isDemoSubmitting}
                                className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm bg-[#1546D8] hover:bg-[#0F37B3] text-white shadow-md hover:shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                            >
                                {processing ? (
                                    <>
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Memproses...</span>
                                    </>
                                ) : (
                                    <span>Sign In</span>
                                )}
                            </button>

                            {/* Secondary Demo Quick-Access Button */}
                            <button
                                type="button"
                                disabled={processing || isDemoSubmitting}
                                onClick={() => handleFillDemo('test@example.com', 'password')}
                                className="w-full py-3 px-4 rounded-2xl font-semibold text-xs sm:text-sm bg-white dark:bg-[#162030] border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A273B] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs disabled:opacity-50"
                            >
                                {isDemoSubmitting ? (
                                    <>
                                        <span className="w-4 h-4 border-2 border-slate-400 border-t-slate-700 dark:border-t-white rounded-full animate-spin" />
                                        <span>Memasuki Workspace...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4 text-[#F5A623]" />
                                        <span>Gunakan Akun Uji Coba (Admin)</span>
                                    </>
                                )}
                            </button>

                            {/* Feature sync indicator pill */}
                            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                <Sparkles className="w-3 h-3 text-[#1546D8] dark:text-[#7BA4FF]" />
                                <span>Sinkronisasi otomatis analitik & postingan Instagram saat masuk</span>
                            </div>
                        </form>

                        {/* Bottom link: "Mengalami kendala masuk? Bantuan" */}
                        <div className="text-center pt-5 mt-2">
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                Mengalami kendala masuk?{' '}
                                <a
                                    href="https://wa.me/6285841980107"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-slate-800 dark:text-slate-200 hover:text-[#1546D8] dark:hover:text-[#7BA4FF] transition-colors"
                                >
                                    Bantuan
                                </a>
                            </span>
                        </div>
                    </div>

                    {/* RIGHT ASSET: Creator at laptop positioned at far right corner */}
                    <div className="hidden md:block absolute -right-2 sm:-right-4 lg:-right-6 xl:-right-8 bottom-0 z-10 pointer-events-none select-none">
                        {/* Light mode creator asset */}
                        <img
                            src="/images/aset-icon.png"
                            alt="Ilustrasi Kreator SPARC"
                            className="w-36 sm:w-44 lg:w-48 xl:w-52 h-auto object-contain dark:hidden"
                        />
                        {/* Dark mode creator asset */}
                        <img
                            src="/images/aset-icon-dark.png"
                            alt="Ilustrasi Kreator SPARC Dark"
                            className="w-36 sm:w-44 lg:w-48 xl:w-52 h-auto object-contain hidden dark:block"
                        />
                    </div>
                </div>

                {/* 3. BOTTOM FOOTER BAR */}
                <footer className="w-full flex items-center justify-between text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 pt-4 z-20 border-t border-slate-200/60 dark:border-slate-800/60">
                    <span>&copy; 2026 SPARC. Social Media Planner, Analytict &amp; Report Content.</span>
                    <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-0.5 rounded-md font-medium">
                        HUMAS Instansi
                    </span>
                </footer>
            </div>
        </div>
    );
}

// Standalone layout without PersistentAppShell (dashboard sidebar/header)
Login.layout = (page: React.ReactNode) => page;
