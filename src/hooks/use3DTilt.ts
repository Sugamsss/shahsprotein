import { useRef, useEffect } from 'react';

export function use3DTilt<T extends HTMLElement = HTMLDivElement>(maxTiltDeg = 14) {
  const cardRef = useRef<T>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    let reqId: number;
    let rect: DOMRect | null = null;

    const handleMouseEnter = () => {
      rect = card.getBoundingClientRect();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!rect) rect = card.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -maxTiltDeg;
      const rotateY = ((x - centerX) / centerX) * maxTiltDeg;

      if (reqId) cancelAnimationFrame(reqId);

      reqId = requestAnimationFrame(() => {
        card.style.transform = `perspective(1000px) translateZ(28px) translateY(-8px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.04, 1.04, 1.04)`;
        card.style.transition = 'transform 0.08s ease-out';
      });
    };

    const handleMouseLeave = () => {
      rect = null;
      if (reqId) cancelAnimationFrame(reqId);
      card.style.transition = 'transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.transform = 'perspective(1000px) translateZ(0px) translateY(0px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    };

    card.addEventListener('mouseenter', handleMouseEnter, { passive: true });
    card.addEventListener('mousemove', handleMouseMove, { passive: true });
    card.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    return () => {
      card.removeEventListener('mouseenter', handleMouseEnter);
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', handleMouseLeave);
      if (reqId) cancelAnimationFrame(reqId);
    };
  }, [maxTiltDeg]);

  return cardRef;
}
