export default function LogoBar() {
  return (
    <div
      style={{
        width: '40px',
        height: '40px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src="/images/apple-touch-icon.png?v=6"
        alt="NQRust - Analytics"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
