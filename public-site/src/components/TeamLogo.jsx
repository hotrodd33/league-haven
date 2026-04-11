/**
 * Shared TeamLogo component for public site — renders team logo image or a
 * home-plate shaped fallback with primary/secondary team colors and age+level label.
 */

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

function plateLabel(ageGroup, level) {
  if (!ageGroup) return null;
  const nums = ageGroup.match(/\d+/g);
  const age = nums ? nums[nums.length - 1] : '';
  return age + (level || '');
}

// Real home-plate shape (flat top, point bottom) — viewBox 0 0 589 589
export function HomePlate({ label, cityAbbr, primaryColor = '#003366', secondaryColor = '#CC0000', size = 'w-8 h-8' }) {
  const displayText = label || cityAbbr || '?';
  const textColor = contrastText(primaryColor);
  const num = parseInt((size.match(/w-(\d+)/) || [])[1] || '8', 10);
  const len = displayText.length;
  const fontSize = len >= 5 ? (num <= 6 ? 130 : 110) : len >= 4 ? (num <= 6 ? 150 : 120) : (num <= 6 ? 180 : num <= 10 ? 150 : num <= 14 ? 130 : 120);
  return (
    <svg viewBox="0 0 589 589" className={`${size} shrink-0`} aria-hidden="true">
      <polygon points="7.5,291.39 7.5,7.5 581.5,7.5 581.5,291.39 294.5,578.39" fill={primaryColor} />
      <path d="M574,15v273.29l-279.5,279.5L15,288.29V15h559M589,0H0v294.5l294.5,294.5,294.5-294.5V0h0Z" fill={secondaryColor} />
      <text
        x="294.5" y="220"
        textAnchor="middle"
        dominantBaseline="central"
        fill={textColor}
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        letterSpacing="4"
      >
        {displayText.substring(0, 6)}
      </text>
    </svg>
  );
}

export default function TeamLogo({ src, name, ageGroup, level, cityAbbr, primaryColor, secondaryColor, size = 'w-8 h-8' }) {
  if (src) return <img src={src} alt={name || ''} className={`${size} object-contain rounded shrink-0`} />;
  const label = plateLabel(ageGroup, level);
  return (
    <HomePlate
      label={label}
      cityAbbr={cityAbbr || (name ? name[0] : '?')}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      size={size}
    />
  );
}
