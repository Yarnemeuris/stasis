'use client';

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="review-dark-theme">
      {children}
    </div>
  );
}
