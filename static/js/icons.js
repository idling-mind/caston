/* ==========================================================================
   CastOn — icon set
   A tiny inline-SVG sprite so the console has zero runtime CDN dependencies.
   All glyphs are 24x24, stroke-based, and inherit currentColor.
   ========================================================================== */
(function (w) {
    const S = {
        // --- navigation & chrome ---
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        home: '<path d="m3 9.5 9-7.5 9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.5 22v-8h5v8"/>',
        power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/>',
        play: '<path d="M6 3.6v16.8a1 1 0 0 0 1.53.85l13.2-8.4a1 1 0 0 0 0-1.7L7.53 2.75A1 1 0 0 0 6 3.6z" fill="currentColor" stroke="none"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',

        // --- chevrons ---
        'chevron-up': '<path d="m18 15-6-6-6 6"/>',
        'chevron-down': '<path d="m6 9 6 6 6-6"/>',
        'chevron-left': '<path d="m15 18-6-6 6-6"/>',
        'chevron-right': '<path d="m9 18 6-6-6-6"/>',

        // --- devices & connect ---
        smartphone: '<rect width="13" height="20" x="5.5" y="2" rx="2.5"/><path d="M12 18.2h.01"/>',
        qr: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/><path d="M14 14h3v3h-3zM21 14v.01M21 21v.01M14 21v-1"/>',
        wifi: '<path d="M12 20h.01"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M1.5 9a15 15 0 0 1 21 0"/>',
        cast: '<path d="M2 16.1A5 5 0 0 1 6.9 21"/><path d="M2 12.05A9 9 0 0 1 10.95 21"/><path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 20h.01"/>',

        // --- status ---
        crown: '<path d="M2.5 4.5 6 16h12l3.5-11.5-5.75 6.25L12 4l-3.75 6.75z"/><path d="M6 20h12"/>',
        trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.7V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/>',
        timer: '<path d="M10 2h4"/><path d="M12 14v-4"/><circle cx="12" cy="14" r="8"/>',
        zap: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
        sparkles: '<path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15.5 19.8 17.7 22 18.5l-2.2.8L19 21.5l-.8-2.2L16 18.5l2.2-.8z"/>',
        flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
        brain: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/>',
        palette: '<circle cx="13.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".6" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.56C21.97 6.01 17.46 2 12 2z"/>',
        brush: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
        trash: '<path d="M3 6h18"/><path d="M18 6v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M10 11v6M14 11v6"/>',
        send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
        plus: '<path d="M5 12h14M12 5v14"/>',
        minus: '<path d="M5 12h14"/>',
        layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
        'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
        shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
        'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        'gamepad': '<path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11" r=".8" fill="currentColor"/><circle cx="18" cy="13.5" r=".8" fill="currentColor"/><rect x="2" y="6" width="20" height="12" rx="5"/>',
        eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'
    };

    /**
     * Build an inline SVG string for a named icon.
     * @param {string} name  key from the sprite above
     * @param {object} [opts]
     * @param {number|string} [opts.size]   px size (default: inherit from CSS)
     * @param {number} [opts.stroke]        stroke width (default 2)
     * @param {string} [opts.cls]           extra class names
     */
    function icon(name, opts) {
        const o = opts || {};
        const body = S[name];
        if (!body) return '';
        const attrs = [
            'xmlns="http://www.w3.org/2000/svg"',
            'viewBox="0 0 24 24"',
            'fill="none"',
            'stroke="currentColor"',
            'stroke-width="' + (o.stroke != null ? o.stroke : 2) + '"',
            'stroke-linecap="round"',
            'stroke-linejoin="round"',
            'aria-hidden="true"',
            'focusable="false"'
        ];
        if (o.size) {
            attrs.push('width="' + o.size + '"', 'height="' + o.size + '"');
        }
        if (o.cls) attrs.push('class="' + o.cls + '"');
        return '<svg ' + attrs.join(' ') + '>' + body + '</svg>';
    }

    icon.names = Object.keys(S);

    w.CastOn = w.CastOn || {};
    w.CastOn.icon = icon;
})(window);
