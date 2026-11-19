import { useState } from 'react';
import Mediciones from './Mediciones.jsx';
import Medicamentos from './Medicamentos.jsx';
import Alertas from './Alertas.jsx';
import PanelPersonal from './PanelPersonal.jsx';
import Perfil from './Perfil.jsx';
import InicioPaciente from './InicioPaciente.jsx';

export default function Panel({ sesion }) {
  const [vista, setVista] = useState('inicio');
  if (sesion.rol !== 'paciente') return <PanelPersonal sesion={sesion} />;
  return <>
    <nav className="pestanas" aria-label="Secciones del paciente">
      <button aria-pressed={vista === 'inicio'} className={vista === 'inicio' ? 'activa' : ''} onClick={() => setVista('inicio')}>Inicio</button>
      <button aria-pressed={vista === 'mediciones'} className={vista === 'mediciones' ? 'activa' : ''} onClick={() => setVista('mediciones')}>Mediciones</button>
      <button aria-pressed={vista === 'medicamentos'} className={vista === 'medicamentos' ? 'activa' : ''} onClick={() => setVista('medicamentos')}>Medicamentos</button>
      <button aria-pressed={vista === 'alertas'} className={vista === 'alertas' ? 'activa' : ''} onClick={() => setVista('alertas')}>Alertas</button>
      <button aria-pressed={vista === 'perfil'} className={vista === 'perfil' ? 'activa' : ''} onClick={() => setVista('perfil')}>Mi información / Telegram</button>
    </nav>
    {vista === 'inicio' ? <InicioPaciente onNavigate={setVista} /> : vista === 'mediciones' ? <Mediciones /> : vista === 'medicamentos' ? <Medicamentos /> : vista === 'alertas' ? <Alertas /> : <Perfil />}
  </>;
}
