export const GENERATED_DIFFICULTY_COLORS_START = 'phi-theme-studio:difficulty-colors:start'
export const GENERATED_DIFFICULTY_COLORS_END = 'phi-theme-studio:difficulty-colors:end'

export const DIFFICULTY_COLOR_CSS = `/* ${GENERATED_DIFFICULTY_COLORS_START} */
.rank-AT { background-color: var(--AT); }
.rank-IN { background-color: var(--IN); }
.rank-HD { background-color: var(--HD); }
.rank-EZ { background-color: var(--EZ); }
.info-AT { background-color: color-mix(in srgb, var(--AT) 30%, transparent); border-color: var(--AT); }
.info-IN { background-color: color-mix(in srgb, var(--IN) 30%, transparent); border-color: var(--IN); }
.info-HD { background-color: color-mix(in srgb, var(--HD) 30%, transparent); border-color: var(--HD); }
.info-EZ { background-color: color-mix(in srgb, var(--EZ) 30%, transparent); border-color: var(--EZ); }
/* ${GENERATED_DIFFICULTY_COLORS_END} */`
