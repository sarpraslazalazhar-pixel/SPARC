import React from 'react';

interface SparcLogoProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    iconOnly?: boolean;
    showSubtitle?: boolean;
}

export const SparcLogo: React.FC<SparcLogoProps> = ({
    className = '',
    size = 'md',
    iconOnly = false,
    showSubtitle = false,
}) => {
    const sizeMap = {
        sm: 'h-8',
        md: 'h-10',
        lg: 'h-14',
    };

    if (iconOnly) {
        return (
            <div className={`inline-flex items-center justify-center select-none ${className}`}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="35 55 225 285"
                    className={`${sizeMap[size]} w-auto transition-transform duration-200`}
                    fill="none"
                >
                    <g>
                        <path
                            d="M 188 224 C 148 214 100 184 78 148 C 62 122 66 90 92 74 C 118 58 146 72 150 105 C 153 136 163 176 188 224 Z"
                            fill="#1E4CE6"
                        />
                        <path
                            d="M 195 235 C 158 236 112 240 78 243 C 48 246 48 280 74 298 C 104 316 146 306 176 275 C 188 262 194 248 195 235 Z"
                            fill="#00B884"
                        />
                        <path
                            d="M 196 232 C 188 250 184 275 185 295 C 186 320 206 330 222 318 C 234 308 233 284 222 258 C 214 242 204 235 196 232 Z"
                            fill="#E11E50"
                        />
                        <path
                            d="M 223 166 Q 219 193 244 207 Q 216 213 205 230 Q 198 206 186 187 Q 204 182 223 166 Z"
                            fill="#F5A623"
                        />
                    </g>
                </svg>
            </div>
        );
    }

    return (
        <div className={`flex items-center select-none ${className}`}>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox={showSubtitle ? '0 0 1200 400' : '35 55 1100 285'}
                className={`${sizeMap[size]} w-auto transition-colors duration-200`}
                fill="none"
            >
                {/* 1. ICON MARK (SPLASH & SPARKLE) */}
                <g id="sparc-icon">
                    {/* Top Blue Droplet */}
                    <path
                        d="M 188 224 C 148 214 100 184 78 148 C 62 122 66 90 92 74 C 118 58 146 72 150 105 C 153 136 163 176 188 224 Z"
                        fill="#1E4CE6"
                    />
                    {/* Left Teal / Green Droplet */}
                    <path
                        d="M 195 235 C 158 236 112 240 78 243 C 48 246 48 280 74 298 C 104 316 146 306 176 275 C 188 262 194 248 195 235 Z"
                        fill="#00B884"
                    />
                    {/* Bottom Pink / Magenta Droplet */}
                    <path
                        d="M 196 232 C 188 250 184 275 185 295 C 186 320 206 330 222 318 C 234 308 233 284 222 258 C 214 242 204 235 196 232 Z"
                        fill="#E11E50"
                    />
                    {/* Central Sparkle / Star (Gold/Amber) */}
                    <path
                        d="M 223 166 Q 219 193 244 207 Q 216 213 205 230 Q 198 206 186 187 Q 204 182 223 166 Z"
                        fill="#F5A623"
                    />
                </g>

                {/* 2. MAIN WORDMARK "SPARC" - Adapts to Dark Mode: Stroke is White in Dark, Black in Light */}
                <g
                    id="sparc-wordmark"
                    fill="none"
                    strokeWidth="16.5"
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                    className="stroke-slate-900 dark:stroke-white transition-colors duration-200"
                >
                    {/* Letter 'S' */}
                    <path d="M 404 142 C 404 115 378 108.5 347 108.5 C 308 108.5 288 124 288 147 C 288 174 310 184 347 191 C 386 198 406 208 406 234 C 406 261 380 273.5 347 273.5 C 310 273.5 288 264 288 239" />
                    {/* Letter 'P' */}
                    <path d="M 466 100 L 466 282" />
                    <path d="M 466 108.5 L 528 108.5 C 564 108.5 585 125 585 153 C 585 181 564 197.5 528 197.5 L 466 197.5" />
                    {/* Letter 'A' */}
                    <path d="M 622 282 L 694 100 L 766 282" />
                    <path d="M 655 220 L 733 220" />
                    {/* Letter 'R' */}
                    <path d="M 808 100 L 808 282" />
                    <path d="M 808 108.5 L 865 108.5 C 899 108.5 918 125 918 153 C 918 181 899 197.5 865 197.5 L 808 197.5" />
                    <path d="M 860 197.5 L 936 282" />
                    {/* Letter 'C' */}
                    <path d="M 1118 138 C 1098 116 1070 108.5 1042 108.5 C 994 108.5 962 144 962 191 C 962 238 994 273.5 1042 273.5 C 1070 273.5 1098 266 1118 244" />
                </g>

                {/* 3. SUBTITLE TEXT (Optional) */}
                {showSubtitle && (
                    <text
                        x="270"
                        y="325"
                        className="fill-slate-900 dark:fill-white font-medium text-[24.5px] transition-colors duration-200"
                        style={{
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            letterSpacing: '0.04em',
                        }}
                    >
                        SOCIAL MEDIA PLANNER, ANALYTICS & REPORT CONTENT
                    </text>
                )}
            </svg>
        </div>
    );
};
