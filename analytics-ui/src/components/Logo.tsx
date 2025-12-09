interface Props {
  size?: number;
  color?: string;
}

export const Logo = (props: Props) => {
  const { size = 30 } = props;
  // Use the CIMB Analytics logo - logo is square (500x500)
  return (
    <img
      src="/images/nexus-analytics-logo.png?v=7"
      alt="CIMB Analytics"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        display: 'block',
      }}
    />
  );
};
