import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createAppServices, ServicesProvider } from './app/services';
import './styles/base.css';
import './styles/child.css';
import './styles/parent.css';
import './styles/showcase.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');
const root = createRoot(container);
root.render(<div className="boot">Opening the school doors…</div>);

createAppServices()
  .then((services) => {
    root.render(
      <ServicesProvider services={services}>
        <App />
      </ServicesProvider>,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    root.render(
      <div className="boot" role="alert">
        Something went wrong starting the classroom. Please reload the page.
      </div>,
    );
  });
