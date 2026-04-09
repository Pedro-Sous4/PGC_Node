import { IconBaseProps } from 'react-icons';
import { AiOutlineLoading } from 'react-icons/ai';

export default function Spinner(props: IconBaseProps) {
  return <AiOutlineLoading className="animate-spin" {...props} />;
}
