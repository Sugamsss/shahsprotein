import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// The landing page only uses BrowserRouter, Routes and Route, and
// react-router-dom is one module in the landing entry chunk. Any other export
// the admin uses (Link, NavLink, Navigate, Outlet, useParams) gets kept in that
// chunk, so the admin builds its few router pieces from useNavigate and
// useLocation, which the router already needs.

/** A real link (open in new tab works) that routes in place on a plain click. */
export const AdminLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({ to, onClick, ...rest }) => {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        const elsewhere = (rest.target && rest.target !== '_self') || rest.download !== undefined;
        if (e.defaultPrevented || elsewhere || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
};

/** Navigate, once per target. */
export const Redirect: React.FC<{ to: string; state?: unknown }> = ({ to, state }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true, state });
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps -- state is a new object each render
  return null;
};

/** One part of the path, counted after /admin: the code in /admin/orders/SN-7KQ4M is usePathPart(1). */
export const usePathPart = (index: number): string => {
  const parts = useLocation().pathname.split('/').filter(Boolean).slice(1);
  return decodeURIComponent(parts[index] ?? '');
};
