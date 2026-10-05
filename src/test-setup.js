// Les tests ne parlent jamais à un vrai Supabase.
import { vi } from 'vitest';
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!window.IntersectionObserver) window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
import '@testing-library/jest-dom/vitest';
