/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                kosa: {
                    primary: '#1E40AF',    // deep royal blue (header/nav)
                    primaryDark: '#1E3A8A', // darker hover
                    primaryLight: '#3B82F6', // accent buttons
                    secondary: '#60A5FA',   // lighter blue for cards/hovers
                    neutral: {
                        50: '#F8FAFC',
                        100: '#F1F5F9',
                        900: '#0F172A',
                    },
                    accent: '#F97316',      // optional subtle orange accent if needed (not dominant)
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}