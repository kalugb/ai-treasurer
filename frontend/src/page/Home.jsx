import { useState, useEffect } from "react";

const formatNumbers = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function Home() {
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const [text, setText] = useState("");

  const randomNum = Math.floor(Math.random() * 5000000);
  const formattedNum = formatNumbers(randomNum);

  const buttonOnClick = () => {
    isButtonClicked ? setIsButtonClicked(false) : setIsButtonClicked(true);
    text == "button is clicked" ? setText("button is unclicked") : setText("button is clicked");
  }

  useEffect(() => {
    alert("Welcome to the Home page! Tailwind CSS is working correctly.");
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
        <h1 className="text-3xl font-bold text-blue-600">
          Tailwind is working! 🎉
        </h1>
        <p className="text-gray-600">
          If this card has rounded corners, a shadow, and colored text, your setup is good.
        </p>
        <button className="bg-blue-500 hover:bg-blue-700 hover:cursor-pointer text-white font-semibold py-2 px-6 rounded-full transition-colors duration-200"
          onClick={buttonOnClick}
        >
          {isButtonClicked ? "Button Clicked" : "Click Me"}
          {text && <span className="ml-2 text-sm text-gray-400">{text}</span>}
          {formattedNum && <span className="ml-2 text-sm text-gray-400">{formattedNum}</span>}
        </button>
        <div className="flex justify-center gap-2 pt-4">
          <span className="w-4 h-4 bg-red-400 rounded-full"></span>
          <span className="w-4 h-4 bg-yellow-400 rounded-full"></span>
          <span className="w-4 h-4 bg-green-400 rounded-full"></span>
        </div>
      </div>
    </div>
  )
}

export default Home