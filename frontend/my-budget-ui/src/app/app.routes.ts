import { Routes } from '@angular/router';
import { BudgetPageComponent } from './pages/budget-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { SpendingsPageComponent } from './pages/spendings-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: 'budget', component: BudgetPageComponent },
  { path: 'spendings', component: SpendingsPageComponent }
];
