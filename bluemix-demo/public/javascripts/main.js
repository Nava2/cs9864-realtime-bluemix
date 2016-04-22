'use strict';



$(function () {
  // on ready
  
  let ID = null;

  $.post('/api/client', function (data) {
    // data will be 
    // { success: true, id: ID }
    console.log(data);

    ID = data.id;
  });
  
  $('#add-ticker').click(function () {
    let ticker = $('#ticker-box').val();

    let body = {
        id: ID, 
        tickers: [ticker]
      };

    $.post({
      url: '/api/tickers', 
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (data) {
        let $elem = $('<li>');
        $elem.text(ticker);
        
        $('#stock-list').append($elem);
      },
      
      contentType: "application/json"
     });
  });

  // setInterval(function () {
  //
    $.get('/api/fetch',
      {id: ID},
      function (data) {
        let $tbl = $('#data-table tbody');

        console.log(data);
      });
  // }, 1000);
});
