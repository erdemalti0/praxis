export interface FlagOption {
  flag: string;
  label: string;
  description: string;
  hasValue?: boolean;
  placeholder?: string;
  isCustom?: boolean;
}
