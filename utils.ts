export const formatChips = (
  val: number,
  forceDecimal: boolean = false
): string => {
  if (val >= 1000000) {
    const formatted = (val / 1000000).toFixed(1);
    return (forceDecimal ? formatted : formatted.replace(/\.0$/, "")) + "M";
  }
  if (val >= 10000) {
    const formatted = (val / 1000).toFixed(1);
    return (forceDecimal ? formatted : formatted.replace(/\.0$/, "")) + "K";
  }
  return val.toLocaleString();
};
