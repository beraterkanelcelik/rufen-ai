import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import CampaignsList from "./pages/CampaignsList";
import Wizard from "./pages/Wizard";
import Monitor from "./pages/Monitor";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<CampaignsList />} />
          <Route path="/new" element={<Wizard />} />
          <Route path="/campaign/:id" element={<Monitor />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
