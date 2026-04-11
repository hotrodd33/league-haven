/**
 * Shared TeamLogo component — renders team logo image or a home-plate
 * shaped fallback with primary/secondary team colors and city abbreviation.
 *
 * Props:
 *   src           - logo image URL (if present, renders <img>)
 *   cityAbbr      - city abbreviation text to overlay on fallback (e.g. "AUS")
 *   primaryColor   - hex color for background  (default #003366)
 *   secondaryColor - hex color for border       (default #CC0000)
 *   size           - Tailwind size class        (default "w-8 h-8")
 *   name           - team name (used for alt text / first-letter fallback)
 */

// Compute relative luminance and pick black or white text for contrast
function contrastText(hex) {
  if (!hex || hex.length < 7) return '#FFFFFF';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * (r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4)
            + 0.7152 * (g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4)
            + 0.0722 * (b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4);
  return lum > 0.179 ? '#000000' : '#FFFFFF';
}

// SVG home-plate path (fits in a 0-100 viewBox)
const HOME_PLATE = 'M50 6 L90 30 L90 75 L50 96 L10 75 L10 30 Z';

export function HomePlate({ cityAbbr, primaryColor = '#003366', secondaryColor = '#CC0000', size = 'w-8 h-8' }) {
  const textColor = contrastText(primaryColor);
  // Derive font size from Tailwind size class
  const num = parseInt((size.match(/w-(\d+)/) || [])[1] || '8', 10);
  const fontSize = num <= 6 ? '28' : num <= 8 ? '26' : num <= 10 ? '24' : '22';
  return (
    <svg viewBox="0 0 100 100" className={`${size} shrink-0`} aria-hidden="true">
      <path d={HOME_PLATE} fill={primaryColor} stroke={secondaryColor} strokeWidth="6" strokeLinejoin="round" />
      <text
        x="50" y="56"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        letterSpacing="1"
      >
        {(cityAbbr || '?').substring(0, 4)}
      </text>
    </svg>
  );
}

export default function TeamLogo({ src, name, cityAbbr, primaryColor, secondaryColor, size = 'w-8 h-8' }) {
  if (src) return <img src={src} alt={name || ''} className={`${size} object-contain rounded shrink-0`} />;
  return (
    <HomePlate
      cityAbbr={cityAbbr || (name ? name[0] : '?')}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      size={size}
    />
  );
}
