import { evidenceReviewRoutes } from './evidence-review-routes';
import { app } from './index';

app.route('/api/v1/prospects', evidenceReviewRoutes);

export { app };
export default app;
