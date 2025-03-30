export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white shadow-sm text-indigo-600 py-2 text-center text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p>&copy; {currentYear} Pronunciation Helper</p>
      </div>
    </footer>
  );
} 