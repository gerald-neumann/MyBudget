import { Routes } from '@angular/router';
import { requireKeycloakAuthGuard } from './core/require-keycloak-auth.guard';
import { BudgetPageComponent } from './pages/budget-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';
import { SignInFailedComponent } from './pages/sign-in-failed.component';
import { AccountsPageComponent } from './pages/accounts-page.component';
import { SpendingsPageComponent } from './pages/spendings-page.component';
import { HelpPageComponent } from './pages/help-page.component';
import { SsoBridgeComponent } from './pages/sso-bridge.component';

export const routes: Routes = [
  { path: 'sso', component: SsoBridgeComponent },
  { path: 'sign-in-failed', component: SignInFailedComponent },
  {
    path: '',
    canActivate: [requireKeycloakAuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardPageComponent },
      { path: 'budget', component: BudgetPageComponent },
      {
        path: 'actuals',
        component: SpendingsPageComponent,
        data: { ledgerMode: 'all' as const }
      },
      { path: 'income', redirectTo: 'actuals', pathMatch: 'full' },
      { path: 'expenses', redirectTo: 'actuals', pathMatch: 'full' },
      { path: 'spendings', redirectTo: 'actuals', pathMatch: 'full' },
      { path: 'accounts', component: AccountsPageComponent },
      { path: 'help', component: HelpPageComponent },
      { path: '**', redirectTo: 'dashboard' }
    ]
  }
];
