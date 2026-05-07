// Demo mode toggle. When DEMO_MODE=true, every data client returns synthetic
// data instead of hitting Google/Meta/Sheets APIs. Used for sales pitches.
export const isDemoMode = () => process.env.DEMO_MODE === 'true';
