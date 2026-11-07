/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // Stacking scale for full-screen layers. Toasts must stay above the highest modal in use (currently z-[110]).
            zIndex: {
                modal: '60',
                toast: '200',
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
