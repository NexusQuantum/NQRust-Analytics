interface Props {
  size?: number;
  color?: string;
}

export const Logo = (props: Props) => {
  const { size = 30 } = props;
  // Use the NQRust - Analytics logo - new logo is square (500x500)
  return (
    <img
      src="/images/nexus-analytics-logo.png?v=6"
      alt="NQRust - Analytics"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        display: 'block',
      }}
    />
  );
};
