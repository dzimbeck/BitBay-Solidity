const DOM = {
  tabsNav: document.querySelector('.tabs__nav'),
  tabsNavItems: document.querySelectorAll('.tabs__nav-item'),
  panels: document.querySelectorAll('.tabs__panel') };


//set active nav element
const setActiveItem = elem => {

  DOM.tabsNavItems.forEach(el => {

    el.classList.remove('js-active');

  });

  elem.classList.add('js-active');

};

//find active nav element
const findActiveItem = () => {

  let activeIndex = 0;

  for (let i = 0; i < DOM.tabsNavItems.length; i++) {

    if (DOM.tabsNavItems[i].classList.contains('js-active')) {
      activeIndex = i;
      break;
    };

  };

  return activeIndex;

};

//find active nav elements parameters: left coord, width
const findActiveItemParams = activeItemIndex => {

  const activeTab = DOM.tabsNavItems[activeItemIndex];

  //width of elem
  const activeItemWidth = activeTab.offsetWidth - 1;

  //left coord in the tab navigation
  const activeItemOffset_left = activeTab.offsetLeft;

  return [activeItemWidth, activeItemOffset_left];

};

//appending decoration block to an active nav element
const appendDecorationNav = () => {

  //creating decoration element
  let decorationElem = document.createElement('div');

  decorationElem.classList.add('tabs__nav-decoration');
  decorationElem.classList.add('js-decoration');

  //appending decoration element to navigation
  DOM.tabsNav.append(decorationElem);

  //appending styles to decoration element
  return decorationElem;
};

//appending styles to decoration nav element
const styleDecorElem = (elem, decorWidth, decorOffset) => {
  elem.style.width = `${decorWidth}px`;
  elem.style.transform = `translateX(${decorOffset}px)`;
};

//show/hide slippage input field

const checkSlippageBox = index => {
  if (index == 1 || index == 2)
    document.getElementById('slippageField').classList.remove('hidden');
  else
    document.getElementById('slippageField').classList.add('hidden');
};
//find active panel
const findActivePanel = index => {

  return DOM.panels[index];

};

//set active panel class
const setActivePanel = index => {

  DOM.panels.forEach(el => {

    el.classList.remove('js-active');

  });

  DOM.panels[index].classList.add('js-active');

};

//onload function
window.addEventListener('load', () => {

  //find active nav item
  const activeItemIndex = findActiveItem();

  //find active nav item params
  const [decorWidth, decorOffset] = findActiveItemParams(activeItemIndex);

  //appending decoration element to an active elem
  const decorElem = appendDecorationNav();

  //setting styles to the decoration elem
  styleDecorElem(decorElem, decorWidth, decorOffset);

  //find active panel
  findActivePanel(activeItemIndex);

  //set active panel
  setActivePanel(activeItemIndex);
});

//click nav item function
DOM.tabsNav.addEventListener('click', e => {

  const navElemClass = 'tabs__nav-item';

  //check if we click on a nav item
  if (e.target.classList.contains(navElemClass)) {

    const clickedTab = e.target;

    const activeItemIndex = Array.from(DOM.tabsNavItems).indexOf(clickedTab);

    //set active nav item
    setActiveItem(clickedTab);

    //find active nav item
    const activeItem = findActiveItem();

    //find active nav item params
    const [decorWidth, decorOffset] = findActiveItemParams(activeItem);

    //setting styles to the decoration elem
    const decorElem = document.querySelector('.js-decoration');

    styleDecorElem(decorElem, decorWidth, decorOffset);

    //find active panel
    findActivePanel(activeItemIndex);

    //set active panel
    setActivePanel(activeItemIndex);

    checkSlippageBox(activeItemIndex)

  }

});





/*add/hide top panel*/

window.onscroll = function() {
  // We add pageYOffset for compatibility with IE.
  var scrollTrigger = 24;
  if (window.scrollY >= scrollTrigger || window.pageYOffset >= scrollTrigger) {
    document.getElementById("wrap").classList.add('scrolled');
    //document.querySelector("#wrap")[0].classList.add('scrolled');
  } else {
    document.getElementById("wrap").classList.remove('scrolled');
    //document.querySelector("#wrap")[0].classList.remove('scrolled');
  }
};



/*select dropdown menu*/
/*
var testarSelect = ".select-menu";
var optionMenu = document.querySelector(testarSelect),
       selectBtn = optionMenu.querySelector(testarSelect + " .select-btn"),
       options = optionMenu.querySelectorAll(testarSelect + " .option"),
       sBtn_text = optionMenu.querySelector(testarSelect + " .sBtn-text");
 
selectBtn.addEventListener("click", () => optionMenu.classList.toggle("active"));       
 
options.forEach(option =>{
    option.addEventListener("click", ()=>{
        var selectedOption = option.querySelector(".option-text").innerText;
        //sBtn_text.innerText = selectedOption;
 
        optionMenu.classList.remove("active");
    });
});

*/

function initDropDownMenu(elName, callBackEl="") {
  var optionMenu = document.querySelector(elName),
         selectBtn = optionMenu.querySelector(".select-btn"),
         options = optionMenu.querySelectorAll(".option"),
         sBtn_text = optionMenu.querySelector(".sBtn-text");
         sBtn_title = optionMenu.querySelector(".sBtn-title");


         console.log('=======================');
         console.log('element name: ' + elName);
         console.log('sBtn_title: ', sBtn_title);
   
  selectBtn.addEventListener("click", () => optionMenu.classList.toggle("active"));       
   
  options.forEach(option =>{
      option.addEventListener("click", ()=>{
          var selectedOption = option.querySelector(".option-text").innerText;
          //sBtn_text.innerText = selectedOption;
          console.log('selectedOption: ' + selectedOption);

          optionMenu.classList.remove("active");


          
          if(callBackEl != ""){
            if(document.getElementById(callBackEl) !== undefined)
              document.getElementById(callBackEl).innerText = selectedOption;
          
              //set the select title text
            if (callBackEl.includes("buy") || callBackEl.includes("sell")) {
              sBtn_text.querySelector(".sBtn-title").innerText = selectedOption.split(' ')[0];
            }
          }

          



          
      });
  });
  
}

initDropDownMenu("#swap_network",);
//initDropDownMenu("#swap_buy_dropdown", "swap_buy_title");
//initDropDownMenu("#swap_sell_dropdown", "swap_sell_title");



//on DOM load
document.addEventListener("DOMContentLoaded", function() {


//range slider for info panel
var keypressSlider = document.querySelector(".slider-keypress");
var input0 = document.querySelector(".input-with-keypress-0");
var input1 = document.querySelector(".input-with-keypress-1");
var inputs = [input0, input1];

noUiSlider.create(keypressSlider, {
  start: [0, 240],
  connect: true,
  step: 1,
  range: {
    min: [0],
    max: [240]
  }
});

/* begin Inputs  */

/* end Inputs  */
keypressSlider.noUiSlider.on("update", function(values, handle) {
  inputs[handle].value = values[handle];

  /* begin Listen to keypress on the input */
  function setSliderHandle(i, value) {
    var r = [null, null];
    r[i] = value;
    keypressSlider.noUiSlider.set(r);
  }

  // Listen to keydown events on the input field.
  inputs.forEach(function(input, handle) {
    input.addEventListener("change", function() {
      setSliderHandle(handle, this.value);
    });

    input.addEventListener("keydown", function(e) {
      var values = keypressSlider.noUiSlider.get();
      var value = Number(values[handle]);

      // [[handle0_down, handle0_up], [handle1_down, handle1_up]]
      var steps = keypressSlider.noUiSlider.steps();

      // [down, up]
      var step = steps[handle];

      var position;

      // 13 is enter,
      // 38 is key up,
      // 40 is key down.
      switch (e.which) {
        case 13:
          setSliderHandle(handle, this.value);
          break;

        case 38:
          // Get step to go increase slider value (up)
          position = step[1];

          // false = no step is set
          if (position === false) {
            position = 1;
          }

          // null = edge of slider
          if (position !== null) {
            setSliderHandle(handle, value + position);
          }

          break;

        case 40:
          position = step[0];

          if (position === false) {
            position = 1;
          }

          if (position !== null) {
            setSliderHandle(handle, value - position);
          }

          break;
      }
    });
  });
  /* end Listen to keypress on the input */
});


//range slider for info panel
var keypressSlider2 = document.querySelector(".slider-keypress-liquidity");
var input0_range2 = document.querySelector(".input-with-keypress-3");
var input1_range2 = document.querySelector(".input-with-keypress-4");
var inputs_range2 = [input0_range2, input1_range2];

noUiSlider.create(keypressSlider2, {
  start: [0, 240],
  connect: true,
  step: 1,
  range: {
    min: [0],
    max: [240]
  }
});

/* begin Inputs  */

/* end Inputs  */
keypressSlider2.noUiSlider.on("update", function(values, handle) {
  inputs_range2[handle].value = values[handle];

  /* begin Listen to keypress on the input */
  function setSliderHandle(i, value) {
    var r = [null, null];
    r[i] = value;
    keypressSlider2.noUiSlider.set(r);
  }

  // Listen to keydown events on the input field.
  inputs_range2.forEach(function(input, handle) {
    input.addEventListener("change", function() {
      setSliderHandle(handle, this.value);
    });

    input.addEventListener("keydown", function(e) {
      var values = keypressSlider2.noUiSlider.get();
      var value = Number(values[handle]);

      // [[handle0_down, handle0_up], [handle1_down, handle1_up]]
      var steps = keypressSlider2.noUiSlider.steps();

      // [down, up]
      var step = steps[handle];

      var position;

      // 13 is enter,
      // 38 is key up,
      // 40 is key down.
      switch (e.which) {
        case 13:
          setSliderHandle(handle, this.value);
          break;

        case 38:
          // Get step to go increase slider value (up)
          position = step[1];

          // false = no step is set
          if (position === false) {
            position = 1;
          }

          // null = edge of slider
          if (position !== null) {
            setSliderHandle(handle, value + position);
          }

          break;

        case 40:
          position = step[0];

          if (position === false) {
            position = 1;
          }

          if (position !== null) {
            setSliderHandle(handle, value - position);
          }

          break;
      }
    });
  });
  /* end Listen to keypress on the input */
});





  //swap buy modal
  var swapBuyModal = new Modal({el: document.getElementById('modal-swap-buy')});

  document.querySelector('.swapFirstCoin').addEventListener('click', function() {
    //new Modal({el: document.getElementById('modal-swap-buy')}).show();
    swapBuyModal.show();
  });

  var swapExchangeForModal = new Modal({el: document.getElementById('modal-swap-inexchange-for')});
  document.querySelector('.swapSecondCoin').addEventListener('click', function() {
    //new Modal({el: document.getElementById('modal-swap-buy')}).show();
    swapExchangeForModal.show();
  });
  

//b-swap-group
//b-swap-radio-row

/*
var tableSwapElements = document.getElementById('modal-swap-buy');
var swapRows = tableSwapElements.getElementsByTagName('tr');
//var elements = document.querySelector("#modal-swap-buy .custom-table tbody tr");

console.log('elements: ', swapRows);
for (var i = 0; i < swapRows.length; i++) {

  (swapRows)[i].addEventListener("click", function() {
    var rb = this.querySelector('input[name="b-swap-group"]');
    rb.checked = true;

    var selectedValue = rb.value;
    //alert(selectedValue);
  });
}
*/

//select handling for buy/sell swap in modal
var swapBuyDialog = document.querySelectorAll('#modal-swap-buy .custom-table tbody tr');

swapBuyDialog.forEach(box => {
  box.addEventListener('click', function () {
    var radioEl = this.querySelector('input[name="b-swap-group"]');
    this.querySelector('input[name="b-swap-group"]').checked = true;


    console.log('choosen coin:', this.dataset.coin);
    console.log('choosen cointext:', this.dataset.cointext);

    var swapCoin = this.dataset.coin;
    var swapCoinText = this.dataset.cointext;
    document.querySelector('.swapFirstCoinTxt').innerText = swapCoinText;

    //set the selected value 
    document.getElementById("SwapCoin").value = radioEl.value;

    document.getElementById("swapCoin1Text").innerText = swapCoin;

    

    //hide the buy/swap modal 
    swapBuyModal.hide();

  });
});

//select handling for in exchange for modal
document.getElementById('SwapCoin2').addEventListener('change', (event) => {
  console.log('event.target.value: '+ event.target.value);  //Selected value

  
  var swapEl = document.getElementById('SwapCoin2');
  var swapCoinText = swapEl.options[swapEl.selectedIndex].text;
  console.log('swapCoinText: ' + swapCoinText);

  

  document.getElementById("swapCoin2Text").innerText = swapCoinText;

  swapExchangeForModal.hide();
});



var radios = document.querySelectorAll('input[type=radio][name="burn-liquid-reserve"]');
radios.forEach( radio => radio.addEventListener('change', () => {
  //alert(radio.value);
  document.getElementById("coinToBurn").value = radio.value;

})
);



//radio-burn-liquid



});