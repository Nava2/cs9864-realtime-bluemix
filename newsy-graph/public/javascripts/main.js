'use strict';

$(function () {
  // ID for the client
  let ID;

  let DATE_FORMAT = "YYYY-MM-DDThh:mm:ss";

  $.post('/api/new', function (body) {
    console.log(body);

    if (body.success) {
      ID = body.id;
    } else {
      console.log("WE DONE GOOFED.");
    }


  });
  
  let tickers = [];

  let fetchTimeout;

  $('#add-ticker').click(function () {
    let $tbox = $('#ticker-box');
    let ticker = $tbox.val().toUpperCase();

    if (ticker.length > 0) {
      let idx = _.sortedIndexOf(tickers, ticker);
      if (idx === -1) {

        $("#ticker-form").removeClass("has-error");

        tickers.push(ticker);
        tickers = tickers.sort();

        let $elem = $('<li>');
        $elem.text(ticker);

        $('#stock-list').append($elem);

        $tbox.val('');

        if (!!fetchTimeout) {
          // have a timeout set clear it
          clearTimeout(fetchTimeout);
        }

        fetch_new_data();

        return;
      }
    }

    $("#ticker-form").addClass("has-error");
  });

  let $chart = $('#stock-chart');

  let chart = new Chart($chart, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
    },
    options: {
      scales: {
        xAxes: [{
          position: "bottom",
          type: 'time',
          time: {
            round: 'second',
            unit: 'minute',
            tooltipFormat: DATE_FORMAT,
            displayFormats: {
              minute: "h:mm a"
            }
          }
        }]
      }
    }

  });

  // stores news by ticker -> time -> [news links]
  let news_map = {};

  let get_colour = (function () {

    let colours = [{ r: 93, g: 165, b: 218 },  { r: 250, g: 164, b: 58 },
                   { r: 96, g: 189, b: 104 },  { r: 241, g: 124, b: 176 },
                   { r: 178, g: 145, b: 47 },  { r: 77, g: 77, b: 77 },
                   { r: 178, g: 118, b: 178 }, { r: 222, g: 207, b: 63 },
                   { r: 241, g: 88, b: 84 } ];
    let idx = 0;

    let FG = _.template('rgba(<%= r %>, <%= g %>, <%= b %>, 1.0)');
    let BG = _.template('rgba(<%= r %>, <%= g %>, <%= b %>, 0.6)');

    return function get_colour() {
      let arr = colours[idx];
      idx = (idx + 1) % colours.length;

      return {
        fg: FG(arr),
        bg: BG(arr)
      };
    };
  })();

  function fetch_new_data() {
    $.get('/api/fetch',
      {id: ID, tickers: tickers},
      function (json) {

        console.log(json);

        if (json.success) {
          // Successful!
          let data = json.data;

          // if (chart.data.labels.length > 0) {
          //   let latest = _.chain(data).map(function (val) {
          //     return moment(DATE_FORMAT, val.time);
          //   }).maxBy(function (m) {
          //     return m.unix();
          //   });
          //
          //   let latest_label = moment(_.last(chart.data.labels), DATE_FORMAT);
          //
          //   if (latest.isAfter(latest_label)) {
          //     // need to add the label
          //     let by_min = moment(latest.format("YYYY-MM-DDThh:mm"), DATE_FORMAT);
          //     chart.data.labels.push(by_min);
          //   }
          // }

          // now the labels should be correct.. lets update the data points

          _.each(data, function (obj, ticker) {
            let uticker = ticker.toUpperCase();

            let time = moment(obj.time, DATE_FORMAT);
            let new_point = { x: obj.time, y: (obj.stock.price / 100) / obj.stock.transactions };

            let dataset_idx = _.findIndex(chart.data.datasets, function (v) {
              return v.label === uticker;
            });

            if (dataset_idx === -1) {
              // new dataset
              let colour = get_colour();
              let dataset = {
                label: uticker,
                borderColor: colour.fg,
                // backgroundColor: colour.bg,
                pointBackgroundColor: colour.bg,
                data: [new_point]
              };

              chart.data.datasets.push(dataset);
            } else {
              // dataset already exists
              let dataset = chart.data.datasets[dataset_idx];
              // check if we need to update or replace one
              let elem_idx = _.findIndex(dataset.data, function (d) {
                return time.isSame(d.x);
              });

              if (elem_idx === -1) {
                // new element, append it to the end
                dataset.data.push(new_point);
              }
            }

            // done handling the datasets, now we update the newsy-time stuff!
            let dmap = news_map[uticker];
            if (!news_map[uticker]) {
              dmap = {};
              news_map[uticker] = dmap;
            }

            dmap[obj.time] = obj.news;
          });

          // in theory, we've now successfully updated all of the datasets

          chart.update(400, 100);
        }

        // let $tbl = $('#data-table').find('tbody');
        //
        // if (data.stocks.length > 0) {
        //   console.log("%O", data);
        //
        //   data.stocks.map(create_row).forEach(function ($r) {
        //     $tbl.prepend($r);
        //   });
        // }

        fetchTimeout = setTimeout(fetch_new_data, 30000);
      });
  }

  $('#fetch-btn').click(function () {

    if (!!fetchTimeout) {
      clearTimeout(fetchTimeout);
    }

    fetch_new_data();
  });


  let $news_list = $('#news-list');

  $chart.click(function (e) {
    let data = chart.getElementAtEvent(e);


    if (data.length > 0) {
      let d_elem = data[0];


      let dset = chart.data.datasets[d_elem._datasetIndex];

      let elem = dset.data[d_elem._index];
      console.log(elem);

      let news = news_map[dset.label][elem.x];
      console.log(news);

      let $elems = news.map(function (story) {
        let $elem = $('<li>');
        let $anchor = $('<a>');

        $anchor.attr('href', story.link);
        $anchor.text(story.title);

        $elem.append($anchor);

        return $elem;
      });

      // we make sure to clear the list just in case
      $news_list.empty();

      $elems.forEach(function ($elem) {
        $news_list.append($elem);
      });

    }
  });

});
