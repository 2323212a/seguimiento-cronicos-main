export const catalogoMedicamentosEducativo = [
  {
    codigo: 'diabetes_tipo_1',
    padecimiento: 'Diabetes tipo 1',
    grupos: [
      {
        nombre: 'Insulinas',
        ejemplos: 'Insulinas rápidas (lispro, aspart) y basales (glargina, degludec); algunos esquemas usan bomba.',
        alcance: 'Tratamiento esencial en diabetes tipo 1. El esquema lo determina el equipo médico.',
      },
      {
        nombre: 'Glucagón de rescate',
        ejemplos: 'Presentaciones inyectables o nasales, según disponibilidad local.',
        alcance: 'Puede prescribirse para tratar hipoglucemia grave; paciente y cuidadores requieren capacitación.',
      },
    ],
    fuentes: [
      { nombre: 'ADA, Standards of Care in Diabetes—2026, secciones 6 y 9', url: 'https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment' },
    ],
  },
  {
    codigo: 'diabetes_tipo_2',
    padecimiento: 'Diabetes tipo 2',
    grupos: [
      {
        nombre: 'Adolescentes de 13 a 17 años',
        ejemplos: 'Metformina; insulina; agonistas GLP-1 como liraglutida o dulaglutida; SGLT2 como empagliflozina, dapagliflozina o canagliflozina, según edad aprobada.',
        alcance: 'La ADA distingue el tratamiento juvenil del adulto; la selección depende del estado clínico y la autorización por edad.',
      },
      {
        nombre: 'Adultos de 18 años en adelante',
        ejemplos: 'Metformina; agonistas GLP-1 como semaglutida o dulaglutida; SGLT2 como empagliflozina o dapagliflozina; insulina cuando está indicada. Existen otras clases.',
        alcance: 'La selección se individualiza según riesgos cardiovasculares y renales, efectos adversos, objetivos y preferencias.',
      },
    ],
    fuentes: [
      { nombre: 'ADA, Standards of Care in Diabetes—2026, adultos, sección 9', url: 'https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment' },
      { nombre: 'ADA, Standards of Care in Diabetes—2026, niños y adolescentes, sección 14', url: 'https://diabetesjournals.org/care/article-pdf/49/Supplement_1/S297/848841/dc26s014.pdf' },
    ],
  },
  {
    codigo: 'hipertension',
    padecimiento: 'Hipertensión arterial',
    grupos: [
      {
        nombre: 'Adolescentes de 13 a 17 años',
        ejemplos: 'Enalapril o lisinopril (ECA); losartán (ARA-II); amlodipino (calcioantagonista); hidroclorotiazida (tiazida).',
        alcance: 'La guía pediátrica condiciona su uso a evaluación clínica. ECA y ARA-II requieren valorar el riesgo de embarazo.',
      },
      {
        nombre: 'Adultos de 18 años en adelante',
        ejemplos: 'Clortalidona o hidroclorotiazida (tiazidas); amlodipino (calcioantagonista); enalapril (ECA); losartán (ARA-II).',
        alcance: 'La guía AHA/ACC 2025 considera promedio de mediciones, riesgo cardiovascular, comorbilidades y circunstancias individuales.',
      },
    ],
    fuentes: [
      { nombre: 'AAP, Clinical Practice Guideline for Screening and Management of High Blood Pressure in Children and Adolescents (2017)', url: 'https://publications.aap.org/pediatrics/article/140/3/e20171904/38358/Clinical-Practice-Guideline-for-Screening-and' },
      { nombre: 'AHA/ACC, 2025 High Blood Pressure Guideline', url: 'https://professional.heart.org/en/science-news/2025-high-blood-pressure-guideline/top-things-to-know' },
    ],
  },
];
