import { AppProvider } from '@ui/store/AppContext';
import { Topbar } from '@ui/components/Topbar';
import { InputPanel } from '@ui/components/InputPanel';
import { ControlBar } from '@ui/components/ControlBar';
import { TextEditor } from '@ui/components/TextEditor';
import { PreviewGrid } from '@ui/components/PreviewGrid';
import { ExportBar } from '@ui/components/ExportBar';
import { SettingsDrawer } from '@ui/components/SettingsDrawer';
import { DraftModal } from '@ui/components/DraftModal';
import { HelpModal } from '@ui/components/HelpModal';
import { LoadingMask } from '@ui/components/LoadingMask';
import { Toast } from '@ui/components/Toast';

export default function App() {
  return (
    <AppProvider>
      <Topbar />
      <main className="layout">
        <InputPanel />
        <section className="work">
          <ControlBar />
          <TextEditor />
          <PreviewGrid />
          <ExportBar />
        </section>
      </main>
      <SettingsDrawer />
      <DraftModal />
      <HelpModal />
      <LoadingMask />
      <Toast />
    </AppProvider>
  );
}
