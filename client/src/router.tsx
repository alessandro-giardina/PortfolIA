import { createBrowserRouter } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.js';
import PortfolioDetailPage from './pages/PortfolioDetailPage.js';
import SecuritySearchPage from './pages/SecuritySearchPage.js';

export const router = createBrowserRouter([
  { path: '/', element: <DashboardPage /> },
  { path: '/portfolio/:id', element: <PortfolioDetailPage /> },
  { path: '/ricerca', element: <SecuritySearchPage /> },
]);
