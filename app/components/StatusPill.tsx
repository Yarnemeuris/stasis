import type { ShopOrderStatus } from '@/app/generated/prisma/enums';

interface StatusPillProps {
  status: ShopOrderStatus;
  className?: string;
}

const STATUS_STYLES: Record<ShopOrderStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'bg-orange-500/15 text-orange-500 border-orange-500/50' },
  ON_HOLD:   { label: 'On Hold',   className: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/50' },
  FULFILLED: { label: 'Fulfilled', className: 'bg-green-600/15  text-green-600  border-green-600/50'  },
  REJECTED:  { label: 'Rejected',  className: 'bg-red-600/15    text-red-600    border-red-600/50'    },
  CANCELLED: { label: 'Cancelled', className: 'bg-cream-500/15  text-cream-500  border-cream-500/50'  },
};

export default function StatusPill({ status, className = '' }: Readonly<StatusPillProps>) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 border text-xs uppercase tracking-wide font-mono ${style.className} ${className}`}
    >
      {style.label}
    </span>
  );
}

export function statusBannerClass(status: ShopOrderStatus): string {
  switch (status) {
    case 'PENDING':
      return 'bg-orange-500/10 border-l-4 border-orange-500 text-orange-500';
    case 'ON_HOLD':
      return 'bg-yellow-500/10 border-l-4 border-yellow-500 text-yellow-500';
    case 'FULFILLED':
      return 'bg-green-600/10 border-l-4 border-green-600 text-green-600';
    case 'REJECTED':
      return 'bg-red-600/10 border-l-4 border-red-600 text-red-600';
    case 'CANCELLED':
      return 'bg-cream-500/10 border-l-4 border-cream-500 text-cream-500';
  }
}
